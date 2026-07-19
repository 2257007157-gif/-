"""Event primitives for the Agent Runtime."""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class AgentEvent:
    name: str
    payload: dict
    created_at: str = datetime.utcnow().isoformat()


class EventBus:
    def __init__(self):
        self.events = []

    def emit(self, name: str, payload: dict):
        event = AgentEvent(name, payload)
        self.events.append(event)
        return event
