"""Qwen3-1.7B on a T4, served as a Modal class (scale-to-zero; MIN_CONTAINERS=1 for the demo).

    modal deploy spectrum/openweights/serve.py
    MIN_CONTAINERS=1 modal deploy spectrum/openweights/serve.py     # demo window
    modal run spectrum/openweights/serve.py --prompt "Summarise: ..."

Cold start with weights cached on the Volume ≈ 35-60 s; warm ≈ 1.5-4 s for a 200-token answer.
Cost per call = T4 $/s x wall seconds (plus a warm-pool share the P&L reports separately).
"""
from __future__ import annotations

import json
import os
import time

import modal

from spectrum import common
from spectrum.pricing import modal_gpu_cost

app = common.app
MODEL_ID = "Qwen/Qwen3-1.7B"
GPU = "T4"
MIN_CONTAINERS = int(os.environ.get("MIN_CONTAINERS", "0"))

_JSON_TAIL = ('\n\nRespond with JSON only: {"answer": <your answer as a string>, "confidence": "high"|"medium"|"low"}. '
              'Use "low" if you are unsure or the question needs information you do not have.')


@app.cls(image=common.gpu_image, gpu=GPU, volumes=common.VOLUMES, secrets=common._optional_hf_secret(), timeout=600,
         scaledown_window=600, min_containers=MIN_CONTAINERS, max_containers=2)
@modal.concurrent(max_inputs=4)
class OpenWeights:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        t0 = time.time()
        self.tok = AutoTokenizer.from_pretrained(MODEL_ID)
        self.model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=torch.float16, device_map="cuda", attn_implementation="sdpa").eval()
        self.load_s = round(time.time() - t0, 1)
        print(f"loaded {MODEL_ID} in {self.load_s}s")

    @modal.method()
    def generate(self, system: str, user: str, max_new_tokens: int = 256, json_answer: bool = True) -> dict:
        import torch

        msgs = [{"role": "system", "content": system}, {"role": "user", "content": user + (_JSON_TAIL if json_answer else "")}]
        prompt = self.tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        enc = self.tok(prompt, return_tensors="pt").to("cuda")
        t0 = time.perf_counter()
        with torch.inference_mode():
            out = self.model.generate(**enc, max_new_tokens=max_new_tokens, do_sample=False, pad_token_id=self.tok.eos_token_id)
        wall = time.perf_counter() - t0
        new = out[0, enc["input_ids"].shape[1]:]
        text = self.tok.decode(new, skip_special_tokens=True).strip()
        parsed, conf = None, "medium"
        if json_answer:
            try:
                s, e = text.find("{"), text.rfind("}")
                parsed = json.loads(text[s:e + 1])
                conf = parsed.get("confidence", "medium")
                text = str(parsed.get("answer", text))
            except Exception:
                conf = "low"
        return {"text": text, "confidence": conf, "prompt_tokens": int(enc["input_ids"].shape[1]), "completion_tokens": int(new.shape[0]),
                "latency_ms": round(wall * 1000, 1), "cost_usd": modal_gpu_cost(gpu=GPU, seconds=wall), "model": MODEL_ID, "gpu": GPU}

    @modal.method()
    def health(self) -> dict:
        return {"ok": True, "model": MODEL_ID, "load_s": getattr(self, "load_s", None)}


@app.local_entrypoint()
def serve_main(prompt: str = "Summarise in one line: revenue grew 12% while margins fell 80bps on input costs."):
    print(json.dumps(OpenWeights().generate.remote("You are a concise financial assistant.", prompt), indent=2))
