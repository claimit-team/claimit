# scripts/probe_gemini_quota.py
import time

import vertexai
from vertexai.generative_models import GenerativeModel

vertexai.init(project="claimit-beta", location="us-east1")
m = GenerativeModel("gemini-2.5-flash")
t0 = time.time()
try:
    resp = m.generate_content("Reply with the single word: OK")
    print(f"SUCCESS in {time.time() - t0:.1f}s -> {resp.text.strip()!r}")
except Exception as e:
    print(f"FAILED in {time.time() - t0:.1f}s -> {type(e).__name__}: {e}")
