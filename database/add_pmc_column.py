import os
import psycopg2

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

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'xx_nic_pm_prj_list'")
cols = [r[0] for r in cur.fetchall()]
print("Has is_pmc_monitored:", 'is_pmc_monitored' in cols)

if 'is_pmc_monitored' not in cols:
    cur.execute("ALTER TABLE public.xx_nic_pm_prj_list ADD COLUMN is_pmc_monitored BOOLEAN DEFAULT FALSE;")
    conn.commit()
    print("Successfully added is_pmc_monitored column to xx_nic_pm_prj_list!")

cur.close()
conn.close()
