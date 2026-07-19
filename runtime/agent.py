"""Core Agent Runtime orchestrator."""

from .events import EventBus
from .memory import MemoryStore
from .planner import Planner


class AgentRuntime:
    def __init__(self):
        self.planner = Planner()
        self.memory = MemoryStore()
        self.events = EventBus()

    def run(self, task: dict):
        plan = self.planner.create_plan(task)
        results = []

        for step in plan:
            self.events.emit("agent.step.started", step)
            results.append(step)
            self.events.emit("agent.step.finished", step)

        self.memory.save("last_task", task)
        return {"plan": plan, "results": results}
