import sqlite3
import datetime
import uuid
import sys
import argparse
import json
import os

DB_PATH = 'prisma/dev.db'
DATA_FILE = 'data/agencies.json'

# --- AGENCY DEFINITIONS (Source of Truth) ---
def load_agencies():
    defaults = [
        {'id': 'user-agency-alpha', 'name': 'Alpha Collections', 'score': 0.92, 'totalCapacity': 4, 'status': 'Established'},
        {'id': 'user-agency-beta', 'name': 'Beta Recovery', 'score': 0.78, 'totalCapacity': 5, 'status': 'Established'},
        {'id': 'user-agency-gamma', 'name': 'Gamma Partners', 'score': 0.60, 'totalCapacity': 3, 'status': 'Probationary'}
    ]
    
    if not os.path.exists(DATA_FILE):
        return defaults

    try:
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
            
        dynamic_agencies = []
        for a in data:
            # Map JSON to Allocation Logic
            # Default capacity logic based on score
            score = a.get('score', 0)
            
            # Normalize score (JSON is 0-100, Allocation expects 0.0-1.0 potentially? 
            # Looking at original code: 'score': 0.92. So yes, expects float 0-1.
            # But wait, original code used 0.92. 
            # JSON has 92.
            # So divide by 100.
            norm_score = score / 100.0
            
            capacity = 3
            if score >= 85: capacity = 5
            elif score >= 75: capacity = 4
            
            status = 'Established' if score > 60 else 'Probationary'
            
            dynamic_agencies.append({
                'id': a['id'],
                'name': a['name'],
                'score': norm_score,
                'totalCapacity': capacity, 
                'status': status
            })
            
        return dynamic_agencies
    except Exception as e:
        print(f"[Allocation.py] Warning: Failed to load agencies.json: {e}")
        return defaults

AGENCIES = load_agencies()

def get_db_connection():
    # Set timeout to 5 seconds to prevent Next.js request timeout usually 10-15s
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.execute('PRAGMA journal_mode=WAL;') # Enable Write-Ahead Logging for concurrency
    conn.row_factory = sqlite3.Row
    return conn

# --- HELPER: LOG AUDIT ---
def log_audit(conn, case_id, actor_id, action, details):
    log_id = str(uuid.uuid4())
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO AuditLog (id, caseId, actorId, action, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        (log_id, case_id, actor_id, action, details, timestamp)
    )

# --- HELPER: GET CASE / LOAD ---
def get_agency_load(conn, agency_id):
    # Using 'Case' table. 
    cur = conn.execute(
        "SELECT COUNT(*) as count FROM 'Case' WHERE assignedToId = ? AND status IN ('ASSIGNED', 'WIP', 'PTP')",
        (agency_id,)
    )
    return cur.fetchone()['count']

def get_agency_hp_load(conn, agency_id):
    cur = conn.execute(
        "SELECT COUNT(*) as count FROM 'Case' WHERE assignedToId = ? AND priority = 'HIGH' AND status IN ('ASSIGNED', 'WIP', 'PTP')",
        (agency_id,)
    )
    return cur.fetchone()['count']

# --- ALGORITHM 1: INGESTION ---
def ingest_mock_data():
    conn = get_db_connection()
    try:
        print("[Allocation.py] Starting Ingestion with Agencies:", [a['name'] for a in AGENCIES])
        
        # 1. Clean Slate (Optional: or just append)
        conn.execute("DELETE FROM AuditLog")
        conn.execute("DELETE FROM SLA")
        conn.execute("DELETE FROM 'Case'")
        conn.execute("DELETE FROM Invoice")
        conn.execute("DELETE FROM User")
        
        # 2. SEED USERS (Agencies & Manager)
        # Creating valid foreign key targets for assignedToId
        users_to_seed = []
        for ag in AGENCIES:
            users_to_seed.append((ag['id'], 'AGENCY', ag['name']))
            
        users_to_seed.append(('user-internal-mgr', 'MANAGER', 'FedEx Manager'))
        
        for uid, role, name in users_to_seed:
            email = f"{name.lower().replace(' ', '.')}@example.com"
            conn.execute(
                "INSERT INTO User (id, email, name, role) VALUES (?, ?, ?, ?)",
                (uid, email, name, role)
            )

        # 3. Generate Queue
        # Scale cases based on agency count? 
        # If we have many agencies, we need more cases to verify allocation.
        # Base 14 cases for 3 agencies (~4.6/agency)
        # Let's do 5 * num_agencies
        
        num_cases = max(14, len(AGENCIES) * 4)
        raw_queue = []
        
        for i in range(num_cases):
            idx = i + 1
            # Round robin priority distribution: High, Medium, Low
            p_idx = i % 3
            p = ['HIGH', 'MEDIUM', 'LOW'][p_idx]
            
            # Score logic
            score = 95 - (i * 2)
            if score < 20: score = 20
            
            amount = 50000.0 - (i * 1000)
            if amount < 1000: amount = 1000
            
            # Due date relative to now for realism (using UTC)
            due_date = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)).isoformat().split('T')[0]

            raw_queue.append({
                'id': f"case-{idx}",
                'invId': f"INV-2026-{str(idx).zfill(3)}",
                'amount': amount,
                'priority': p,
                'aiScore': float(score),
                'dueDate': due_date 
            })
            
        assignments = {} # case_id -> agency_id

        # 4. Reserve for Probationary (10% of total queue)
        reserve_count = max(1, int(num_cases * 0.10))
        main_queue = list(raw_queue)
        newbies = [a for a in AGENCIES if a['status'] == 'Probationary']
        
        if newbies:
            booked = 0
            # Iterate backwards to safely pop
            for i in range(len(main_queue) - 1, -1, -1):
                if booked >= reserve_count: break
                c = main_queue[i]
                if c['priority'] == 'MEDIUM':
                     # Round robin assign to newbies
                     target_newbie = newbies[booked % len(newbies)]
                     assignments[c['id']] = target_newbie['id']
                     booked += 1
                     main_queue.pop(i)

        # 5. Main Allocation
        sorted_agencies = sorted(AGENCIES, key=lambda x: x['score'], reverse=True)
        
        # CRITICAL FIX: Sort queue by Priority (High -> Medium -> Low)
        # This ensures High Priority cases are processed first and never left in queue if capacity exists.
        priority_map = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
        main_queue.sort(key=lambda x: priority_map[x['priority']])
        
        for case_item in main_queue:
            assigned = False
            for agency in sorted_agencies:
                # Calc Realtime Load simulation (base 0 + assigned in this script)
                batch_assigned = sum(1 for cid, aid in assignments.items() if aid == agency['id'])
                if batch_assigned >= agency['totalCapacity']: 
                    continue
                
                # HP Threshold logic
                if case_item['priority'] == 'HIGH':
                    threshold = int(agency['totalCapacity'] * 0.75) if agency['score'] > 0.8 else (int(agency['totalCapacity'] * 0.40) if agency['score'] > 0.5 else 0)
                    
                    # Count current HP assignments for this agency in this batch
                    batch_hp = 0
                    for cid, aid in assignments.items():
                        if aid == agency['id']:
                            # Find priority of that case
                            c_p = next((x['priority'] for x in raw_queue if x['id'] == cid), 'LOW')
                            if c_p == 'HIGH':
                                batch_hp += 1

                    if batch_hp >= threshold:
                        continue
                
                assignments[case_item['id']] = agency['id']
                assigned = True
                break
            
            # If not assigned, it stays in queue (automatically handled by logic below)
        
        # 6. Commit to DB
        # Strict ISO with 3-digit milliseconds for Prisma compatibility
        now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        for item in raw_queue:

            # Invoice
            conn.execute(
                "INSERT INTO Invoice (id, invoiceNumber, amount, currency, dueDate, customerID, customerName, region, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            
            # Fetch Invoice UUID (needed for relation)
            inv_row = conn.execute("SELECT id FROM Invoice WHERE invoiceNumber = ?", (item['invId'],)).fetchone()
            
            assigned_agency_id = assignments.get(item['id'])
            status = 'ASSIGNED' if assigned_agency_id else 'QUEUED'
            sla_status = 'ACTIVE' if assigned_agency_id else 'PENDING'
            assigned_at = now if assigned_agency_id else None
            
            conn.execute(
                "INSERT INTO 'Case' (id, invoiceId, aiScore, recoveryProbability, priority, status, assignedToId, assignedAt, currentSLAStatus, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                # Log initial assignment
                log_audit(conn, item['id'], 'SYSTEM', 'ASSIGNMENT', f"Initial allocation to {assigned_agency_id}")

        conn.commit()
        print("[Allocation.py] Ingestion Complete.")
        
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()


# --- ALGORITHM 2: REALLOCATION (Strict Swap) ---
def reallocate_case(case_id, rejected_by_agency_id):
    conn = get_db_connection()
    try:
        # Get Case
        case_row = conn.execute("SELECT * FROM 'Case' WHERE id = ?", (case_id,)).fetchone()
        if not case_row: 
            print(f"Case {case_id} not found.")
            return
        priority = case_row['priority']
        
        print(f"[Allocation.py] Reallocating Case {case_id} (Priority: {priority})...")

        # RULE 1: Low Priority -> Queue
        if priority == 'LOW':
            # Ensure it is in QUEUED state (Reject.py might have already done this, but safe to ensure)
            conn.execute("UPDATE 'Case' SET status = 'QUEUED', assignedToId = NULL, assignedAt = NULL WHERE id = ?", (case_id,))
            log_audit(conn, case_id, 'SYSTEM', 'QUEUE_RETURN', 'Low priority rejection. Returned to Queue.')
            conn.commit()
            print("Action: Low Priority -> Queue")
            return 

        # RULE 2: High/Medium -> Search
        past_rejectors_rows = conn.execute("SELECT actorId FROM AuditLog WHERE caseId = ? AND action IN ('REJECTION', 'REJECTED')", (case_id,)).fetchall()
        rejected_agency_ids = {r['actorId'] for r in past_rejectors_rows}
        rejected_agency_ids.add(rejected_by_agency_id)
        
        # Candidates from our global definition
        candidates = [a for a in AGENCIES if a['id'] not in rejected_agency_ids]
        
        # Sort candidates by score (High to Low) to try best agencies first
        candidates.sort(key=lambda x: x['score'], reverse=True)
            
        chosen_agency = None
        swap_case_id = None
        
        # Search for a spot
        for cand in candidates:
            cand_id = cand['id']
            cand_cap = cand['totalCapacity']
            current_load = get_agency_load(conn, cand_id)
            
            # Check 1: Is there free space?
            if current_load < cand_cap:
                chosen_agency = cand
                break
            
            # Check 2: If full, can we SWAP/BUMP a low priority case?
            # Only if the incoming case is HIGH/MEDIUM (which we checked above)
            else:
                # Find a bumpable LOW priority case at this agency
                low_case = conn.execute(
                    "SELECT id FROM 'Case' WHERE assignedToId = ? AND priority = 'LOW' AND status IN ('ASSIGNED', 'WIP') LIMIT 1",
                    (cand_id,)
                ).fetchone()
                
                if low_case:
                    chosen_agency = cand
                    swap_case_id = low_case['id']
                    break
        
        if chosen_agency:
            # EXECUTE THE MOVE
            now_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

            # If Swapping, move the Low case out first
            if swap_case_id:
                conn.execute(
                    "UPDATE 'Case' SET status = 'QUEUED', assignedToId = NULL, assignedAt = NULL, currentSLAStatus = 'PENDING' WHERE id = ?",
                    (swap_case_id,)
                )
                log_audit(conn, swap_case_id, 'SYSTEM', 'DISPLACEMENT', f"Displaced by High Priority Case {case_id}. Sent to Queue.")
                print(f"Action: Swapped out {swap_case_id}")
            
            # Move the High case in
            conn.execute(
                "UPDATE 'Case' SET status = 'ASSIGNED', assignedToId = ?, assignedAt = ?, currentSLAStatus = 'ACTIVE' WHERE id = ?",
                (chosen_agency['id'], now_iso, case_id)
            )
            
            details = f"Swapped into {chosen_agency['name']} (Displaced Low Case)." if swap_case_id else f"Reallocated to {chosen_agency['name']}."
            log_audit(conn, case_id, 'SYSTEM', 'REALLOCATION', details)
            print(f"Action: {details}")
        else:
            # agencies full/rejected -> Queue
            conn.execute("UPDATE 'Case' SET status = 'QUEUED', assignedToId = NULL WHERE id = ?", (case_id,))
            log_audit(conn, case_id, 'SYSTEM', 'QUEUE_WAIT', "All eligible agencies full or rejected. Queued.")
            print("Action: Agencies Full/Rejected -> Queue")

        conn.commit()

    except Exception as e:
        print(f"Error in reallocation: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

# --- ALGORITHM 3: SLA CHECK ---
def check_sla_breaches():
    conn = get_db_connection()
    try:
        print("[Allocation.py] Checking SLA Breaches...")
        
        rows = conn.execute("SELECT * FROM 'Case' WHERE status = 'ASSIGNED' AND currentSLAStatus = 'ACTIVE'").fetchall()
        
        revoked_count = 0
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        
        for row in rows:
            if not row['assignedAt']: continue
            
            # Handle varied date formats (sometimes ISO has 'Z', sometimes not)
            try:
                # Handle ISO format. If 'Z' was present, fromisoformat handles it in Python 3.7+ usually, 
                # but if we stripped it or if it's missing, we force UTC.
                assigned_at = datetime.datetime.fromisoformat(row['assignedAt'].replace('Z', '+00:00'))
            except ValueError:
                continue

            elapsed_hours = (now_dt - assigned_at).total_seconds() / 3600.0
            
            limit = 120 # Low default (5 days)
            if row['priority'] == 'HIGH': limit = 24 # 1 day
            elif row['priority'] == 'MEDIUM': limit = 72 # 3 days
            
            if elapsed_hours > limit:
                # BREACH!
                conn.execute(
                    "UPDATE 'Case' SET status = 'REVOKED', currentSLAStatus = 'BREACHED', assignedToId = NULL WHERE id = ?",
                    (row['id'],)
                )
                
                agency_name = "Unknown Agency"
                if row['assignedToId']:
                    # Simple lookup in hardcoded list to save DB query if user table sync is weird
                    ag = next((a for a in AGENCIES if a['id'] == row['assignedToId']), None)
                    if ag: agency_name = ag['name']
                
                log_audit(conn, row['id'], 'SYSTEM_DAEMON', 'SLA_BREACH', f"Offer revoked. Timeout > {limit}h. Agency {agency_name} penalized.")
                revoked_count += 1
                
                # Trigger reallocation immediately
                # In a real daemon, you might queue this job. Here we call function directly.
                # But we need to know who "rejected" (failed) it. The agency who timed out.
                # reallocate_case(row['id'], row['assignedToId']) <--- Logic for future improvement
                
        conn.commit()
        print(f"[Allocation.py] SLA Check Complete. Revoked: {revoked_count}")

    except Exception as e:
        print(f"Error in SLA Check: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['ingest', 'reallocate', 'check_sla'], required=True)
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