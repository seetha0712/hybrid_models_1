"""TinyDecoder: pre-LN causal transformer, tied input/output embeddings.

Default config -> 1,722,368 parameters (see count_params):
  tok emb 4096x128 = 524,288 | pos 64x128 = 8,192 | 6 layers x 198,272 | final LN 256
The label is read at the <sep> position: logits over label-token ids only.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class TinyConfig:
    vocab_size: int = 4096
    ctx: int = 64
    d_model: int = 128
    n_layers: int = 6
    n_heads: int = 4
    d_ff: int = 512
    dropout: float = 0.1
    aux_lm_weight: float = 0.1

    def to_dict(self) -> dict:
        return asdict(self)


class Block(nn.Module):
    def __init__(self, c: TinyConfig):
        super().__init__()
        self.ln1 = nn.LayerNorm(c.d_model)
        self.attn = nn.MultiheadAttention(c.d_model, c.n_heads, dropout=c.dropout, batch_first=True)
        self.ln2 = nn.LayerNorm(c.d_model)
        self.ff = nn.Sequential(nn.Linear(c.d_model, c.d_ff), nn.GELU(), nn.Linear(c.d_ff, c.d_model), nn.Dropout(c.dropout))

    def forward(self, x: torch.Tensor, causal: torch.Tensor, pad_mask: torch.Tensor) -> torch.Tensor:
        h = self.ln1(x)
        a, _ = self.attn(h, h, h, attn_mask=causal, key_padding_mask=pad_mask, need_weights=False)
        x = x + a
        return x + self.ff(self.ln2(x))


class TinyDecoder(nn.Module):
    def __init__(self, c: TinyConfig, label_ids: list[int]):
        super().__init__()
        self.c = c
        self.tok_emb = nn.Embedding(c.vocab_size, c.d_model)
        self.pos_emb = nn.Embedding(c.ctx, c.d_model)
        self.drop = nn.Dropout(c.dropout)
        self.blocks = nn.ModuleList([Block(c) for _ in range(c.n_layers)])
        self.ln_f = nn.LayerNorm(c.d_model)
        self.register_buffer("label_ids", torch.tensor(label_ids, dtype=torch.long), persistent=False)
        self.register_buffer("causal", torch.triu(torch.ones(c.ctx, c.ctx, dtype=torch.bool), diagonal=1), persistent=False)
        nn.init.normal_(self.tok_emb.weight, std=0.02)
        nn.init.normal_(self.pos_emb.weight, std=0.02)

    @property
    def head_weight(self) -> torch.Tensor:  # tied: no separate output matrix
        return self.tok_emb.weight

    def hidden(self, ids: torch.Tensor, pad_id: int) -> torch.Tensor:
        B, T = ids.shape
        pos = torch.arange(T, device=ids.device)
        x = self.drop(self.tok_emb(ids) + self.pos_emb(pos)[None])
        pad_mask = ids.eq(pad_id)
        causal = self.causal[:T, :T]
        for b in self.blocks:
            x = b(x, causal, pad_mask)
        return self.ln_f(x)

    def forward(self, ids: torch.Tensor, sep_pos: torch.Tensor, pad_id: int) -> tuple[torch.Tensor, torch.Tensor]:
        """Returns (label_logits [B, n_labels], lm_logits [B, T, V])."""
        h = self.hidden(ids, pad_id)
        lm_logits = h @ self.head_weight.T
        at_sep = h[torch.arange(h.size(0), device=h.device), sep_pos]  # [B, d]
        label_logits = at_sep @ self.head_weight[self.label_ids].T  # [B, n_labels]
        return label_logits, lm_logits

    def loss(self, ids: torch.Tensor, sep_pos: torch.Tensor, y: torch.Tensor, pad_id: int) -> tuple[torch.Tensor, dict]:
        label_logits, lm_logits = self.forward(ids, sep_pos, pad_id)
        cls = F.cross_entropy(label_logits, y)
        # auxiliary next-token loss on the narration tokens (positions < sep) helps merchant morphology
        tgt = ids[:, 1:].clone()
        keep = torch.arange(tgt.size(1), device=ids.device)[None] < sep_pos[:, None]
        tgt[~keep] = -100
        lm = F.cross_entropy(lm_logits[:, :-1].reshape(-1, lm_logits.size(-1)), tgt.reshape(-1), ignore_index=-100)
        total = cls + self.c.aux_lm_weight * lm
        return total, {"cls": cls.item(), "lm": lm.item()}


def count_params(m: nn.Module) -> int:
    return sum(p.numel() for p in m.parameters())


def build(c: TinyConfig, label_ids: list[int]) -> TinyDecoder:
    return TinyDecoder(c, label_ids)
