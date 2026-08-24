with open(r"c:\knowledge\Confidential\NICSI\npms\database\npms_db_full_dump.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()

clean_lines = []
for line in lines:
    if line.startswith(r"\restrict"):
        continue
    clean_lines.append(line)

with open(r"c:\knowledge\Confidential\NICSI\npms\database\npms_db_full_dump.sql", "w", encoding="utf-8") as f:
    f.writelines(clean_lines)

print(f"[+] Removed \\restrict lines. Total lines: {len(clean_lines)}")
