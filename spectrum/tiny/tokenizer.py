"""Byte-level BPE tokenizer trained on the dataset text plus one special token per label.

Vocab is fixed at 4096 total (BPE merges + specials) so the embedding matrix, and hence the
parameter count, does not depend on the dataset. Normalisation: NFKC (folds full/half-width
forms) + lowercase, so 'ｾﾌﾞﾝｲﾚﾌﾞﾝ' and 'セブンイレブン', 'Starbucks' and 'STARBUCKS' share tokens.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from tokenizers import Tokenizer, decoders, models, normalizers, pre_tokenizers, trainers

VOCAB_SIZE = 4096
PAD, BOS, SEP = "<pad>", "<bos>", "<sep>"


def label_token(label: str) -> str:
    return f"<L:{label}>"


def train_tokenizer(texts: Iterable[str], labels: list[str], *, vocab_size: int = VOCAB_SIZE) -> Tokenizer:
    specials = [PAD, BOS, SEP] + [label_token(l) for l in labels]
    tok = Tokenizer(models.BPE(unk_token=None))
    tok.normalizer = normalizers.Sequence([normalizers.NFKC(), normalizers.Lowercase()])
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size - len(specials),
        min_frequency=2,
        special_tokens=[],
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=False,
    )
    tok.train_from_iterator(list(texts), trainer=trainer)
    tok.add_special_tokens(specials)
    # Pad to a fixed vocab so the embedding matrix (and parameter count) never depends on
    # how many merges a small dataset could support.
    deficit = vocab_size - tok.get_vocab_size()
    if deficit > 0:
        tok.add_tokens([f"<unused{i}>" for i in range(deficit)])
    assert tok.get_vocab_size() == vocab_size, tok.get_vocab_size()
    return tok


def save(tok: Tokenizer, labels: list[str], out_dir: str | Path) -> None:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tok.save(str(out_dir / "tokenizer.json"))
    (out_dir / "labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=0))


def load(out_dir: str | Path) -> tuple[Tokenizer, list[str]]:
    out_dir = Path(out_dir)
    tok = Tokenizer.from_file(str(out_dir / "tokenizer.json"))
    labels = json.loads((out_dir / "labels.json").read_text())
    return tok, labels


class Codec:
    """Encodes text into fixed-length id arrays for the model and maps labels <-> ids."""

    def __init__(self, tok: Tokenizer, labels: list[str], ctx: int = 64):
        self.tok, self.labels, self.ctx = tok, labels, ctx
        self.pad_id = tok.token_to_id(PAD)
        self.bos_id = tok.token_to_id(BOS)
        self.sep_id = tok.token_to_id(SEP)
        self.label_ids = [tok.token_to_id(label_token(l)) for l in labels]
        assert all(i is not None for i in self.label_ids), "label tokens missing from tokenizer"
        self.label_to_idx = {l: i for i, l in enumerate(labels)}

    @property
    def vocab_size(self) -> int:
        return self.tok.get_vocab_size()

    def encode(self, text: str) -> tuple[list[int], int]:
        """Returns (ids padded to ctx, position of <sep>)."""
        body = self.tok.encode(text).ids[: self.ctx - 2]
        ids = [self.bos_id] + body + [self.sep_id]
        sep_pos = len(ids) - 1
        ids = ids + [self.pad_id] * (self.ctx - len(ids))
        return ids, sep_pos

    def encode_batch(self, texts: list[str]) -> tuple[list[list[int]], list[int]]:
        encs = self.tok.encode_batch(list(texts))
        out_ids, out_pos = [], []
        for e in encs:
            body = e.ids[: self.ctx - 2]
            ids = [self.bos_id] + body + [self.sep_id]
            out_pos.append(len(ids) - 1)
            out_ids.append(ids + [self.pad_id] * (self.ctx - len(ids)))
        return out_ids, out_pos
