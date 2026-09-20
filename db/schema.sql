CREATE DATABASE IF NOT EXISTS incident_engine_db;
USE incident_engine_db;

-- 1. Services Table
CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'HEALTHY',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(50) PRIMARY KEY,
    service_id INT,
    error_summary TEXT,
    status VARCHAR(50) DEFAULT 'INVESTIGATING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);

-- 3. RCA Reports Table
CREATE TABLE IF NOT EXISTS rca_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id VARCHAR(50) UNIQUE,
    report_markdown LONGTEXT,
    culprit_commit VARCHAR(100),
    suggested_fix TEXT,
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

-- Seed Services
INSERT IGNORE INTO services (id, name, status) VALUES
(1, 'AUTH_SERVICE', 'HEALTHY'),
(2, 'ORDER_SERVICE', 'HEALTHY'),
(3, 'PAYMENT_SERVICE', 'HEALTHY'),
(4, 'DATABASE_CORE', 'HEALTHY');

-- Seed Scenarios
INSERT IGNORE INTO incidents (id, service_id, error_summary, status, created_at, resolved_at) VALUES
('INC-101', 3, 'HTTP 500: Database connection pool exhausted under load', 'RESOLVED', NOW() - INTERVAL 10 MINUTE, NOW() - INTERVAL 9 MINUTE),
('INC-204', 1, 'HTTP 504: Expired token refresh deadlock in Redis cluster', 'RESOLVED', NOW() - INTERVAL 20 MINUTE, NOW() - INTERVAL 19 MINUTE),
('INC-308', 2, 'HTTP 502: Bad Gateway, upstream inventory latency > 5000ms', 'RESOLVED', NOW() - INTERVAL 30 MINUTE, NOW() - INTERVAL 29 MINUTE);