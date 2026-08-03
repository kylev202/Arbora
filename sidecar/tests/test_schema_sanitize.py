"""`_grammar_safe_schema` strips the string length bounds that break Ollama's
structured-output grammar builder, while leaving the rest of the schema intact.

Regression guard for the "failed to load model vocabulary required for format"
500 that a large `maxLength` (e.g. the diagram's mermaid_code, chat's answer)
triggered on Ollama through 0.18.x.
"""

from pydantic import BaseModel, Field

from arbora_ai.llm.provider import _grammar_safe_schema


def test_strips_string_length_bounds():
    schema = {
        "type": "object",
        "properties": {"a": {"type": "string", "minLength": 10, "maxLength": 4000}},
        "required": ["a"],
    }
    out = _grammar_safe_schema(schema)
    assert out["properties"]["a"] == {"type": "string"}
    # Structural keys survive untouched.
    assert out["required"] == ["a"]
    assert out["type"] == "object"


def test_recurses_into_defs_items_and_lists():
    schema = {
        "$defs": {"Inner": {"type": "string", "maxLength": 2600}},
        "properties": {
            "arr": {"type": "array", "items": {"type": "string", "maxLength": 500}},
            "ref": {"$ref": "#/$defs/Inner"},
        },
    }
    out = _grammar_safe_schema(schema)
    assert out["$defs"]["Inner"] == {"type": "string"}
    assert out["properties"]["arr"]["items"] == {"type": "string"}
    assert out["properties"]["ref"] == {"$ref": "#/$defs/Inner"}


def test_leaves_array_and_integer_constraints_alone():
    # minItems/maxItems and integer bounds build fine — only string length breaks.
    schema = {
        "type": "object",
        "properties": {
            "opts": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
            "idx": {"type": "array", "items": {"type": "integer"}},
        },
    }
    out = _grammar_safe_schema(schema)
    assert out["properties"]["opts"]["minItems"] == 4
    assert out["properties"]["opts"]["maxItems"] == 4
    assert out["properties"]["idx"]["items"] == {"type": "integer"}


def test_does_not_mutate_input():
    schema = {"type": "string", "maxLength": 4000}
    _grammar_safe_schema(schema)
    assert schema == {"type": "string", "maxLength": 4000}


def test_real_pydantic_schema_loses_only_length_keys():
    class DiagramGen(BaseModel):
        title: str = Field(min_length=1, max_length=100)
        mermaid_code: str = Field(min_length=10, max_length=4000)
        used_passage_indices: list[int]

    out = _grammar_safe_schema(DiagramGen.model_json_schema())
    props = out["properties"]
    assert "maxLength" not in props["mermaid_code"]
    assert "minLength" not in props["mermaid_code"]
    assert props["mermaid_code"]["type"] == "string"
    assert props["used_passage_indices"]["items"] == {"type": "integer"}
