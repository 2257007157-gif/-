"""Task planner for Agent Runtime MVP."""


class Planner:
    def create_plan(self, task: dict) -> list[dict]:
        return [
            {"agent": "asset_agent", "action": "validate", "task": task},
            {"agent": "prompt_agent", "action": "generate", "task": task},
            {"agent": "workflow_agent", "action": "execute", "task": task},
            {"agent": "quality_agent", "action": "check", "task": task},
        ]
