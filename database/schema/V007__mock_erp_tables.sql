CREATE TABLE mock_erp.erp_projects (
    erp_project_id VARCHAR(50) PRIMARY KEY,
    project_name VARCHAR(500),
    ministry_code VARCHAR(20),
    department_code VARCHAR(20),
    budget NUMERIC(20,2),
    status VARCHAR(50),
    start_date DATE,
    last_modified TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE mock_erp.erp_purchase_orders (
    erp_po_id VARCHAR(50) PRIMARY KEY,
    erp_project_id VARCHAR(50),
    vendor_name VARCHAR(500),
    amount NUMERIC(20,2),
    status VARCHAR(50),
    po_date DATE,
    last_modified TIMESTAMPTZ DEFAULT NOW()
);
