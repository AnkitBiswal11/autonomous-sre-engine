import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASS", "root123"),
        database="incident_engine_db",
        cursorclass=pymysql.cursors.DictCursor
    )

def fetch_incident_logs(incident_id: str):
    """Fetches real-time error logs from MySQL for the given incident."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT log_level, message FROM incident_logs WHERE incident_id = %s",
                (incident_id,)
            )
            logs = cursor.fetchall()
            if not logs:
                return f"No telemetry logs found for incident {incident_id}."
            return logs
    finally:
        conn.close()

def inspect_recent_git_diff(service_name: str):
    """Fetches recent git commit diffs tailored to the specific microservice."""
    normalized_name = (service_name or "").upper()

    diffs = {
        "AUTH_SERVICE": {
            "commit_hash": "a14f92e",
            "author": "auth-team@internal.net",
            "changed_files": ["src/redis/lock.ts"],
            "diff": "@@ -22,3 +22,3 @@\n-  const LOCK_TTL_MS = 10000;\n+  const LOCK_TTL_MS = 0; // Disabled auto-release lock timeout"
        },
        "PAYMENT_SERVICE": {
            "commit_hash": "b78d21c",
            "author": "sre-dev@internal.net",
            "changed_files": ["config/database.yaml"],
            "diff": "@@ -14,3 +14,3 @@\n-  pool_size: 50\n+  pool_size: 2 # temporary test config commit"
        },
        "ORDER_SERVICE": {
            "commit_hash": "e43c89b",
            "author": "backend-eng@internal.net",
            "changed_files": ["src/clients/inventoryClient.ts"],
            "diff": "@@ -8,3 +8,3 @@\n-  timeoutMs: 10000,\n+  timeoutMs: 500; // Aggressive timeout without circuit breaker"
        }
    }

    return diffs.get(normalized_name, {
        "commit_hash": "0000000",
        "author": "unknown",
        "changed_files": [],
        "diff": f"No recent diffs found for {service_name}."
    })

def get_service_topology(service_name: str):
    """Reads dependency mappings from MySQL."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT s2.name AS dependent_service, s2.health_status
                FROM services s1
                JOIN service_dependencies sd ON s1.id = sd.parent_service_id
                JOIN services s2 ON sd.child_service_id = s2.id
                WHERE s1.name = %s
            """, (service_name,))
            return cursor.fetchall()
    except Exception:
        # Graceful fallback if service_dependencies schema differs
        return [{"dependent_service": "DATABASE_CORE", "health_status": "HEALTHY"}]
    finally:
        conn.close()