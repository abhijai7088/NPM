import psycopg2
import sys

def main():
    conn = psycopg2.connect(
        host="localhost",
        port=5433,
        dbname="npms_db",
        user="npms_user",
        password="npms_local_pass_2026"
    )
    cur = conn.cursor()

    print("[+] Fetching PM IDs...")
    cur.execute("SELECT prj_mgr_id, full_name, email FROM public.project_manager ORDER BY prj_mgr_id;")
    pms = cur.fetchall()
    pm_ids = [p[0] for p in pms]
    num_pms = len(pm_ids)
    print(f"[+] Found {num_pms} PMs: {pm_ids}")

    print("[+] Distributing projects in public.xx_nic_pm_prj_list...")
    # Fetch all project header_ids
    cur.execute("SELECT header_id FROM public.xx_nic_pm_prj_list ORDER BY header_id;")
    project_headers = [r[0] for r in cur.fetchall()]
    
    for idx, hid in enumerate(project_headers):
        assigned_pm_id = pm_ids[idx % num_pms]
        cur.execute("UPDATE public.xx_nic_pm_prj_list SET prj_mgr_id = %s WHERE header_id = %s;", (assigned_pm_id, hid))

    print(f"[+] Assigned {len(project_headers)} projects across {num_pms} PMs.")

    print("[+] Syncing child tables prj_mgr_id with parent projects...")
    # Update xx_nic_pm_po_list
    cur.execute("""
        UPDATE public.xx_nic_pm_po_list po
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE po.project_id = p.project_id;
    """)

    # Update xx_nic_pm_invoice_list
    cur.execute("""
        UPDATE public.xx_nic_pm_invoice_list inv
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE inv.project_id = p.project_id;
    """)

    # Update xx_nic_pm_bill_dsk_list
    cur.execute("""
        UPDATE public.xx_nic_pm_bill_dsk_list bd
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE bd.project_id = p.project_id;
    """)

    # Update xx_nic_pm_tax_inv_list
    cur.execute("""
        UPDATE public.xx_nic_pm_tax_inv_list tax
        SET prj_mgr_id = p.prj_mgr_id
        FROM public.xx_nic_pm_prj_list p
        WHERE tax.project_id = p.project_id;
    """)

    print("[+] Provisioning app_user records for all 18 PMs...")
    pwd_hash = "$2a$10$e0MYzXyjpJS7Pd0RVvHwHeFz8N7N0wFpM7gV/8W9m1B4JqK4x2K.S" # password123
    for p in pms:
        pm_id, full_name, email = p
        # generate a unique username like pm_<pm_id> or email prefix
        uname = email.split('@')[0].replace('.', '_').lower()
        if not uname:
            uname = f"pm_{pm_id}"

        cur.execute("""
            INSERT INTO public.app_user (
                username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation, is_deleted
            )
            VALUES (%s, %s, %s, %s, 'PM', %s, 'system', TRUE, 'md.alok_tiwari', 'North Zone', 'Project Manager', FALSE)
            ON CONFLICT (username) DO UPDATE SET
                prj_mgr_id = EXCLUDED.prj_mgr_id,
                full_name = EXCLUDED.full_name,
                email = EXCLUDED.email,
                role = 'PM',
                is_active = TRUE,
                managed_by = 'md.alok_tiwari';
        """, (uname, pwd_hash, full_name, email, pm_id))

        # Also create secondary aliases like 'atul' for 1626, 'vikas' for 1566 if needed
        first_word = full_name.split()[0].lower()
        if len(first_word) >= 3:
            cur.execute("""
                INSERT INTO public.app_user (
                    username, password, full_name, email, role, prj_mgr_id, created_by, is_active, managed_by, zone, designation, is_deleted
                )
                VALUES (%s, %s, %s, %s, 'PM', %s, 'system', TRUE, 'md.alok_tiwari', 'North Zone', 'Project Manager', FALSE)
                ON CONFLICT (username) DO UPDATE SET
                    prj_mgr_id = EXCLUDED.prj_mgr_id,
                    full_name = EXCLUDED.full_name,
                    email = EXCLUDED.email,
                    role = 'PM',
                    is_active = TRUE,
                    managed_by = 'md.alok_tiwari';
            """, (first_word, pwd_hash, full_name, email, pm_id))

    conn.commit()
    print("[+] Database distribution & provisioning completed successfully!")
    conn.close()

if __name__ == '__main__':
    main()
