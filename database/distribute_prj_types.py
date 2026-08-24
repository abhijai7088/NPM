import os
import psycopg2

def main():
    db_host = os.environ.get("DB_HOST", "localhost")
    db_port = os.environ.get("DB_PORT", "5433")
    db_name = os.environ.get("DB_NAME", "npms_db")
    db_user = os.environ.get("DB_USER", "npms_user")
    db_pass = os.environ.get("DB_PASSWORD", "npms_local_pass_2026")
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        dbname=db_name,
        user=db_user,
        password=db_pass
    )
    cur = conn.cursor()

    print("[+] Fetching PM IDs...")
    cur.execute("SELECT DISTINCT prj_mgr_id FROM public.xx_nic_pm_prj_list ORDER BY prj_mgr_id;")
    pms = [r[0] for r in cur.fetchall()]

    total_updated = 0
    for pm_id in pms:
        # Fetch distinct category codes for this PM ordered by count descending
        cur.execute("""
            SELECT prj_typ_code 
            FROM public.xx_nic_pmdb_project_list 
            WHERE prj_mgr_id = %s AND prj_typ_code IS NOT NULL AND TRIM(prj_typ_code) <> ''
            ORDER BY noofproject DESC;
        """, (pm_id,))
        distinct_codes = [r[0] for r in cur.fetchall()]
        if not distinct_codes:
            continue

        # Get all project rows for this PM in xx_nic_pm_prj_list
        cur.execute("SELECT header_id FROM public.xx_nic_pm_prj_list WHERE prj_mgr_id = %s ORDER BY header_id;", (pm_id,))
        headers = [r[0] for r in cur.fetchall()]

        for idx, hid in enumerate(headers):
            assigned_code = distinct_codes[idx % len(distinct_codes)]
            cur.execute("UPDATE public.xx_nic_pm_prj_list SET prj_type = %s WHERE header_id = %s;", (assigned_code, hid))
            total_updated += 1

    conn.commit()
    print(f"[+] Successfully distributed distinct category codes round-robin across {total_updated} rows in public.xx_nic_pm_prj_list!")
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
