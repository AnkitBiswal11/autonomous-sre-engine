import os
import re
import json
import traceback
import httpx
from groq import Groq
from app.agents.tools import fetch_incident_logs, inspect_recent_git_diff, get_service_topology
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:5000")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_incident_logs",
            "description": "Fetch error logs and stack traces from the database for an incident ID",
            "parameters": {
                "type": "object",
                "properties": {"incident_id": {"type": "string"}},
                "required": ["incident_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_recent_git_diff",
            "description": "Inspect recent code commit diffs for a microservice",
            "parameters": {
                "type": "object",
                "properties": {"service_name": {"type": "string"}},
                "required": ["service_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_service_topology",
            "description": "Get dependent services and topology from MySQL",
            "parameters": {
                "type": "object",
                "properties": {"service_name": {"type": "string"}},
                "required": ["service_name"]
            }
        }
    }
]

TOOL_MAP = {
    "fetch_incident_logs": fetch_incident_logs,
    "inspect_recent_git_diff": inspect_recent_git_diff,
    "get_service_topology": get_service_topology
}

def extract_commit_hash(text: str) -> str:
    """Extracts a 7-character git commit hash enclosed in backticks or words."""
    match = re.search(r'`([a-f0-9]{7})`', text)
    if match:
        return match.group(1)
    word_match = re.search(r'\b([a-f0-9]{7})\b', text)
    return word_match.group(1) if word_match else "N/A"

async def notify_trace(incident_id: str, message: str, status="RUNNING"):
    try:
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                f"{GATEWAY_URL}/api/internal/agent-trace",
                json={"incidentId": incident_id, "stepLog": message, "status": status},
                timeout=5.0
            )
    except Exception as e:
        print(f"[TRACE ERROR] Could not contact Gateway: {e}")

async def save_rca_report(incident_id: str, final_markdown: str):
    culprit_commit = extract_commit_hash(final_markdown)
    payload = {
        "incidentId": incident_id,
        "reportMarkdown": final_markdown,
        "culpritCommit": culprit_commit,
        "suggestedFix": "Auto-remediated via playbook"
    }
    try:
        async with httpx.AsyncClient() as http_client:
            await http_client.post(
                f"{GATEWAY_URL}/api/internal/rca-report",
                json=payload,
                timeout=5.0
            )
            print(f"[ORCHESTRATOR] Persisted RCA report for {incident_id} to Gateway")
    except Exception as e:
        print(f"[ORCHESTRATOR WARN] Failed to save RCA report: {e}")

async def run_investigation(incident_id: str, service_name: str):
    await notify_trace(incident_id, f"Initiating autonomous investigation on {service_name}...")

    messages = [
        {
            "role": "system",
            "content": (
                "You are an Autonomous Site Reliability Engineer (SRE). "
                "Diagnose the root cause by calling tools: query logs, inspect Git diffs, and check service topology. "
                "Always run tools before arriving at a conclusion. Once sufficient data is collected, "
                "output a concise Root Cause Analysis (RCA) with: Root Cause, Culprit Commit, and Proposed Fix."
            )
        },
        {
            "role": "user",
            "content": f"Investigate critical failure on service '{service_name}' for incident ID '{incident_id}'."
        }
    ]

    try:
        for step in range(5):
            print(f"[ORCHESTRATOR] Step {step + 1}: Querying Groq LLM...")
            
            response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.1
            )

            choice = response.choices[0].message
            messages.append(choice)

            if not choice.tool_calls:
                print("[ORCHESTRATOR] No further tool calls requested. Finalizing...")
                # 1. Persist the markdown RCA to MySQL via the Gateway endpoint
                await save_rca_report(incident_id, choice.content)
                # 2. Emit completion trace event to UI
                await notify_trace(incident_id, f"Conclusion: {choice.content}", status="COMPLETED")
                return choice.content

            for tool_call in choice.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)

                trace_msg = f"Tool Called: {fn_name}({json.dumps(fn_args)})"
                print(f"[ORCHESTRATOR] {trace_msg}")
                await notify_trace(incident_id, trace_msg)

                try:
                    result = TOOL_MAP[fn_name](**fn_args)
                except Exception as tool_err:
                    result = {"error": str(tool_err)}
                    print(f"[TOOL ERROR] {tool_err}")

                messages.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": fn_name,
                    "content": json.dumps(result, default=str)
                })

    except Exception as e:
        print(f"[FATAL ORCHESTRATOR ERROR]: {e}")
        traceback.print_exc()
        await notify_trace(incident_id, f"Investigation aborted due to error: {str(e)}", status="FAILED")