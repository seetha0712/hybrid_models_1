"""PII guardrail (rung R5, the Wells Fargo pattern): a small token classifier that runs in
front of every frontier call so no PII leaves the estate. Technique: full supervised
fine-tuning of a pretrained encoder (DistilBERT multilingual) on span-annotated text."""
