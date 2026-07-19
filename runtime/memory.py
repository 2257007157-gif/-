"""Minimal session memory for Agent Runtime."""


class MemoryStore:
    def __init__(self):
        self.state = {}

    def save(self, key: str, value):
        self.state[key] = value

    def get(self, key: str, default=None):
        return self.state.get(key, default)
