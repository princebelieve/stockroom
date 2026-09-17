// Browser schema is isolated from the native Android database.
export const browserSchema = `
    CREATE TABLE IF NOT EXISTS pwa_stocktakes (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS mobile_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      operation_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sync_inbox (
      operation_id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      remote_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'cashier')),
      operational_access INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      app_name TEXT NOT NULL DEFAULT 'My Business',
      currency TEXT NOT NULL DEFAULT 'USD',
      pos_provider TEXT NOT NULL DEFAULT '',
      pos_terminal_id TEXT NOT NULL DEFAULT '',
      pos_connection TEXT NOT NULL DEFAULT 'manual',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      reorder_point INTEGER NOT NULL DEFAULT 0 CHECK(reorder_point >= 0),
      price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
      cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
      unit TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT NOT NULL DEFAULT '',
      terminal_provider TEXT NOT NULL DEFAULT '',
      staff_id TEXT NOT NULL DEFAULT '',
      staff_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      balance REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      incurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
`
