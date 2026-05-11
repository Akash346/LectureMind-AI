from __future__ import annotations

import json
from typing import Any, List

from pydantic import BaseModel, Field, field_validator, model_validator


MIND_MAP_SYSTEM_PROMPT = (
    "You build hierarchical mind maps from lecture transcripts. "
    "Input: a timestamped transcript. "
    "Output: a JSON tree representing the lecture's conceptual structure, with three or four levels of depth and four to seven children per node. "
    "Every node has a label (max 8 words), a timestampSec pointing to the moment in the lecture where that concept is introduced or most clearly explained, and a summary (one or two sentences). "
    "The root node is the lecture title. "
    "Do not invent concepts not present in the transcript. "
    "Output strictly valid JSON matching the schema. "
    "Respond in the language specified by the language field of the user message."
)


class MindMapNode(BaseModel):
    id: str
    label: str = Field(max_length=80)
    timestampSec: int = Field(ge=0)
    summary: str = Field(max_length=360)
    children: List["MindMapNode"] = Field(default_factory=list)

    @field_validator("label")
    @classmethod
    def label_has_max_eight_words(cls, value: str) -> str:
        words = value.strip().split()
        if len(words) > 8:
            return " ".join(words[:8])
        return value.strip()

    @model_validator(mode="after")
    def truncate_children(self) -> "MindMapNode":
        if len(self.children) > 7:
            self.children = self.children[:7]
        return self


MindMapNode.model_rebuild()


def truncate_depth(
    node: MindMapNode, depth: int = 1, max_depth: int = 4
) -> MindMapNode:
    if depth >= max_depth:
        node.children = []
        return node

    node.children = [
        truncate_depth(child, depth + 1, max_depth=max_depth)
        for child in node.children[:7]
    ]
    return node


class MindMapPayload(BaseModel):
    root: MindMapNode

    @model_validator(mode="after")
    def enforce_limits(self) -> "MindMapPayload":
        self.root = truncate_depth(self.root, depth=1, max_depth=4)
        return self


def parse_mind_map_response(raw: str | dict[str, Any]) -> MindMapPayload:
    if isinstance(raw, str):
        cleaned = raw.strip()

        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()

        parsed = json.loads(cleaned)
    else:
        parsed = raw

    if "root" in parsed:
        return MindMapPayload.model_validate(parsed)

    return MindMapPayload.model_validate({"root": parsed})


async def build_mind_map_agent_payload(
    transcript: str,
    language: str = "en",
    title: str | None = None,
) -> dict[str, Any]:
    user_payload = {
        "language": language,
        "title": title or "Lecture",
        "transcript": transcript,
    }

    return {
        "system": MIND_MAP_SYSTEM_PROMPT,
        "user": json.dumps(user_payload, ensure_ascii=False),
        "schema": MindMapPayload.model_json_schema(),
    }
