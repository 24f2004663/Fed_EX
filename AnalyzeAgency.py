import sys
import json
import os
import argparse
import re
import datetime

DATA_FILE = 'data/agencies.json'

def load_agencies():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r') as f:
        return json.load(f)

def save_agencies(agencies):
    # Create directory if it doesn't exist (though it should)
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, 'w') as f:
        json.dump(agencies, f, indent=2)

def analyze_and_update(agency_id, file_path):
    print(f"[AnalyzeAgency.py] Starting Analysis Model...")
    print(f"Target Agency: {agency_id}")
    print(f"Document: {file_path}")
    
    # Simulate AI Analysis - Look for keywords
    extracted_score = None
    extracted_capacity = None
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
            # regex for score: "Score: 95", "Rating: 88/100", "Performance: 92%"
            score_match = re.search(r'(?:Score|Rating|Performance|Grade)\s*[:=]\s*(\d{1,3})', content, re.IGNORECASE)
            if score_match:
                extracted_score = int(score_match.group(1))
                # Normalize if > 100 (e.g. 950 points)
                if extracted_score > 100: extracted_score = 100
                print(f" >> Extracted Performance Metric: {extracted_score}%")
            
            # regex for capacity: "Capacity: 10", "Cases: 5"
            cap_match = re.search(r'(?:Capacity|Load|Handle|Cases)\s*[:=]\s*(\d{1,3})', content, re.IGNORECASE)
            if cap_match:
                extracted_capacity = int(cap_match.group(1))
                print(f" >> Extracted Capacity Metric: {extracted_capacity} cases/cycle")

    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)

    agencies = load_agencies()
    updated = False
    
    for agency in agencies:
        if agency['id'] == agency_id:
            old_score = agency.get('score', 60)
            
            # Apply Updates
            if extracted_score is not None:
                agency['score'] = extracted_score
                # Update history for the graph
                history = agency.get('history', [0]*12)
                if isinstance(history, list):
                    history.pop(0) # Remove oldest
                    history.append(extracted_score) # Add newest
                    agency['history'] = history
            
            # Just for simulation fun: if no score found, boost by +5 for "Positive Report"
            elif extracted_score is None:
                print(" >> No specific score found. Applying 'Positive Sentiment' boost (+5).")
                new_score = min(100, old_score + 5)
                agency['score'] = new_score
                history = agency.get('history', [0]*12)
                history.pop(0)
                history.append(new_score)
                agency['history'] = history
                
            print(f" >> UPDATE: {agency['name']} Score: {old_score} -> {agency['score']}")
            updated = True
            break
            
    if updated:
        save_agencies(agencies)
        print("[AnalyzeAgency.py] Database Successfully Updated.")
    else:
        print(f"Error: Agency ID {agency_id} not found in registry.")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--agency_id', required=True)
    parser.add_argument('--file', required=True)
    args = parser.parse_args()
    
    analyze_and_update(args.agency_id, args.file)
