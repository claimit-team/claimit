# scripts/probe_modea_verify.py
import asyncio

import vertexai
import vertexai.agent_engines

PROJECT = "claimit-beta"
LOCATION = "us-east1"
RESOURCE = "projects/1037847638228/locations/us-east1/reasoningEngines/7166282538309124096"
TEST_UID = "11f54233-a0e3-5575-99af-b2ebabb19058"
QUERY = "List ALL of my purchases. For each one, give the merchant/platform and the price."


def extract_text(ev):
    if not isinstance(ev, dict):
        return ""
    parts = (ev.get("content") or {}).get("parts") or []
    return "".join(
        p["text"] for p in parts if isinstance(p, dict) and isinstance(p.get("text"), str)
    )


async def main():
    vertexai.init(project=PROJECT, location=LOCATION)
    agent = vertexai.agent_engines.get(RESOURCE)
    print("=== RAW EVENTS ===")
    final_text, saw_error, n = "", False, 0
    async for ev in agent.async_stream_query(
        user_id=TEST_UID,
        message=QUERY,
        run_config={"streaming_mode": "sse"},
    ):
        n += 1
        if isinstance(ev, dict) and (
            "error" in ev or (("code" in ev or "message" in ev) and not extract_text(ev))
        ):
            saw_error = True
            print(f"[{n}] ERROR EVENT: {ev}")
            continue
        is_partial = bool(ev.get("partial")) if isinstance(ev, dict) else False
        txt = extract_text(ev)
        print(
            f"[{n}] ({'partial' if is_partial else 'final'}) keys={list(ev.keys()) if isinstance(ev, dict) else type(ev)} text={txt!r}"
        )
        if not is_partial and txt:
            final_text = txt
    print(f"\n=== EVENTS={n}  ERROR_SEEN={saw_error} ===")
    print("\n=== FINAL ASSEMBLED ANSWER ===")
    print(final_text or "(no final text)")


asyncio.run(main())
